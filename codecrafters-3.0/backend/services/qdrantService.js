const { QdrantClient } = require("@qdrant/js-client-rest");
const crypto = require("crypto");

let qdrantClient = null;

function getClient() {
  if (!qdrantClient) {
    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });
  }
  return qdrantClient;
}

const collectionName = process.env.QDRANT_COLLECTION || "codecrafter";

async function ensurePayloadIndexes(client) {
  const info = await client.getCollection(collectionName);
  const payloadSchema = info?.payload_schema || {};

  const getIndexedType = (schema) =>
    schema?.data_type || schema?.field_type || schema?.type;

  if (getIndexedType(payloadSchema.userId) !== "keyword") {
    console.log(`[qdrantService] Creating payload index for "userId" (keyword) on "${collectionName}"`);
    await client.createPayloadIndex(collectionName, {
      field_name: "userId",
      field_schema: "keyword",
      wait: true,
    });
  }

  if (getIndexedType(payloadSchema.conversationId) !== "keyword") {
    console.log(`[qdrantService] Creating payload index for "conversationId" (keyword) on "${collectionName}"`);
    await client.createPayloadIndex(collectionName, {
      field_name: "conversationId",
      field_schema: "keyword",
      wait: true,
    });
  }
}

/**
 * Ensure the collection exists, create it if not.
 * @param {number} vectorSize - Size of vectors (default 3072 for Gemini)
 */
async function ensureCollection(vectorSize = 3072) {
  const client = getClient();

  try {
    // Try to get collection info
    const info = await client.getCollection(collectionName);
    const configuredSize = info?.config?.params?.vectors?.size;
    if (configuredSize && configuredSize !== vectorSize) {
      throw new Error(
        `[qdrantService] Collection "${collectionName}" has dimension ${configuredSize}, but embeddings are ${vectorSize}. Recreate the collection with the correct dimension.`
      );
    }

    await ensurePayloadIndexes(client);
    console.log(`[qdrantService] Collection "${collectionName}" already exists`);
  } catch (error) {
    if (error.status === 404) {
      // Collection doesn't exist, create it
      console.log(`[qdrantService] Creating collection "${collectionName}" with vector size ${vectorSize}`);
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
      await ensurePayloadIndexes(client);
      console.log(`[qdrantService] Collection "${collectionName}" created successfully`);
    } else {
      throw error;
    }
  }
}

/**
 * Upsert vectors into Qdrant with user-scoped metadata.
 * @param {Array<{id: string, values: number[], metadata: object}>} vectors
 * @param {string} namespace - typically the userId (stored in metadata for filtering)
 */
async function upsertVectors(vectors, namespace) {
  const client = getClient();

  try {
    // Ensure collection exists before upserting
    await ensureCollection(3072);
    const normalizedUserId = String(namespace);

    // Convert vectors to Qdrant point format
    const points = vectors.map((vec) => ({
      id: stringToUuid(vec.id), // Qdrant requires integer or UUID ids
      vector: vec.values,
      payload: {
        ...vec.metadata,
        userId: normalizedUserId, // Store userId in payload for filtering
      },
    }));

    // Batch upsert (Qdrant typically handles larger batches than Pinecone)
    const BATCH = 256;
    for (let i = 0; i < points.length; i += BATCH) {
      await client.upsert(collectionName, {
        wait: true,
        points: points.slice(i, i + BATCH),
      });
    }

    console.log(`[qdrantService] Upserted ${vectors.length} vectors to collection "${collectionName}"`);
  } catch (error) {
    console.error("[qdrantService] Upsert error:", error.message);
    throw error;
  }
}

/**
 * Query Qdrant for nearest neighbors scoped to a specific conversation.
 * @param {number[]} queryVector
 * @param {string} userId
 * @param {number} topK
 * @param {string|null} conversationId - Restrict search to documents in this conversation
 * @param {Array<object>} extraMust - Additional Qdrant `must` filters
 * @returns {Promise<Array>}
 */
async function queryVectors(queryVector, userId, topK = 5, conversationId = null, extraMust = []) {
  const client = getClient();

  try {
    // Ensure collection exists and has compatible dimension before searching.
    await ensureCollection(3072);
    const normalizedUserId = String(userId);

    const mustFilters = [
      { key: "userId", match: { value: normalizedUserId } },
    ];

    if (conversationId) {
      mustFilters.push({ key: "conversationId", match: { value: String(conversationId) } });
    }

    if (Array.isArray(extraMust) && extraMust.length > 0) {
      mustFilters.push(...extraMust);
    }

    const result = await client.search(collectionName, {
      vector: queryVector,
      limit: topK,
      filter: { must: mustFilters },
      with_payload: true,
      with_vector: false,
    });

    // Map Qdrant results to match Pinecone format
    return (result || []).map((hit) => ({
      id: hit.id.toString(),
      score: hit.score,
      metadata: hit.payload,
    }));
  } catch (error) {
    console.error("[qdrantService] Query error:", {
      message: error.message,
      status: error.status,
      data: error.data,
    });
    throw error;
  }
}

/**
 * Delete specific vector IDs from Qdrant.
 * @param {string[]} ids
 * @param {string} userId
 */
async function deleteVectors(ids, userId) {
  if (!ids || ids.length === 0) return;

  const client = getClient();

  try {
    const uuidIds = ids.map((id) => stringToUuid(id));

    // Delete points by IDs
    await client.delete(collectionName, {
      points_selector: {
        points: uuidIds,
      },
    });

    console.log(`[qdrantService] Deleted ${ids.length} vectors from collection "${collectionName}"`);
  } catch (error) {
    console.error("[qdrantService] Delete error:", error.message);
    throw error;
  }
}

/**
 * Convert string IDs to deterministic UUIDs for Qdrant.
 * Uses MD5 to produce a 128-bit hash formatted as a UUID string.
 * This avoids the hash collisions that occurred with 32-bit integers
 * when multiple documents had chunks that mapped to the same ID.
 */
function stringToUuid(str) {
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

module.exports = { upsertVectors, queryVectors, deleteVectors };
