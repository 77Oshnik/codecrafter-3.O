const { QdrantClient } = require("@qdrant/js-client-rest");

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

async function ensureUserIdPayloadIndex(client) {
  const info = await client.getCollection(collectionName);
  const payloadSchema = info?.payload_schema || {};
  const userIdSchema = payloadSchema.userId;
  const indexedType =
    userIdSchema?.data_type || userIdSchema?.field_type || userIdSchema?.type;

  // Qdrant requires a payload index for efficient filtering on keyword fields.
  if (indexedType === "keyword") {
    return;
  }

  console.log(`[qdrantService] Creating payload index for "userId" (keyword) on "${collectionName}"`);
  await client.createPayloadIndex(collectionName, {
    field_name: "userId",
    field_schema: "keyword",
    wait: true,
  });
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

    await ensureUserIdPayloadIndex(client);
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
      await ensureUserIdPayloadIndex(client);
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
      id: hashStringToInt(vec.id), // Qdrant requires integer or UUID ids
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
 * Query Qdrant for nearest neighbors with user-scoped filtering.
 * @param {number[]} queryVector
 * @param {string} userId
 * @param {number} topK
 * @returns {Promise<Array>}
 */
async function queryVectors(queryVector, userId, topK = 5) {
  const client = getClient();

  try {
    // Ensure collection exists and has compatible dimension before searching.
    await ensureCollection(3072);
    const normalizedUserId = String(userId);

    const result = await client.search(collectionName, {
      vector: queryVector,
      limit: topK,
      filter: {
        must: [
          {
            key: "userId",
            match: {
              value: normalizedUserId,
            },
          },
        ],
      },
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
    const intIds = ids.map((id) => hashStringToInt(id));

    // Delete points by IDs
    await client.delete(collectionName, {
      points_selector: {
        points: intIds,
      },
    });

    console.log(`[qdrantService] Deleted ${ids.length} vectors from collection "${collectionName}"`);
  } catch (error) {
    console.error("[qdrantService] Delete error:", error.message);
    throw error;
  }
}

/**
 * Convert string IDs to consistent integers for Qdrant
 * (Qdrant prefers integer point IDs, this creates a stable hash)
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

module.exports = { upsertVectors, queryVectors, deleteVectors };
