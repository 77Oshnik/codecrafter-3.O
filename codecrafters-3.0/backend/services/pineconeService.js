const { Pinecone } = require("@pinecone-database/pinecone");

let pineconeClient = null;

function getClient() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return pineconeClient;
}

function getIndex() {
  return getClient().index(process.env.PINECONE_INDEX_NAME);
}

/**
 * Upsert vectors into a user-scoped namespace.
 * @param {Array<{id: string, values: number[], metadata: object}>} vectors
 * @param {string} namespace - typically the userId
 */
async function upsertVectors(vectors, namespace) {
  const index = getIndex();
  // Pinecone recommends batches of ≤100
  const BATCH = 100;
  for (let i = 0; i < vectors.length; i += BATCH) {
    await index.namespace(namespace).upsert(vectors.slice(i, i + BATCH));
  }
}

/**
 * Query the index for nearest neighbours.
 * @param {number[]} queryVector
 * @param {string} namespace
 * @param {number} topK
 * @returns {Promise<Array>}
 */
async function queryVectors(queryVector, namespace, topK = 5) {
  const index = getIndex();
  const result = await index.namespace(namespace).query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });
  return result.matches || [];
}

/**
 * Delete specific vector IDs from a namespace.
 * @param {string[]} ids
 * @param {string} namespace
 */
async function deleteVectors(ids, namespace) {
  if (!ids || ids.length === 0) return;
  const index = getIndex();
  await index.namespace(namespace).deleteMany(ids);
}

module.exports = { upsertVectors, queryVectors, deleteVectors };
