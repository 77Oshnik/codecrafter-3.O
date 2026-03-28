const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a PDF buffer to Cloudinary under the rag-documents folder.
 * @param {Buffer} buffer
 * @param {string} publicId - unique identifier for the file
 * @returns {Promise<{secure_url: string, public_id: string}>}
 */
function uploadPDF(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "rag-documents",
        public_id: publicId,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

/**
 * Delete a raw file from Cloudinary.
 * @param {string} publicId
 */
async function deletePDF(publicId) {
  await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
}

module.exports = { uploadPDF, deletePDF };
