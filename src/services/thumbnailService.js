const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * Generates an ultra-lightweight WebP thumbnail from an image file
 * @param {string} inputFilePath 
 * @returns {Promise<string|null>} Base64 Data URL of the generated WebP thumbnail
 */
async function generateWebPThumbnail(inputFilePath) {
  try {
    const ext = path.extname(inputFilePath).toLowerCase();
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"];

    if (!imageExtensions.includes(ext)) {
      return null;
    }

    const webpBuffer = await sharp(inputFilePath)
      .resize({
        width: 480,
        height: 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    return `data:image/webp;base64,${webpBuffer.toString("base64")}`;
  } catch (err) {
    console.warn("[THUMBNAIL] Error generating WebP thumbnail:", err.message);
    return null;
  }
}

module.exports = {
  generateWebPThumbnail,
};
