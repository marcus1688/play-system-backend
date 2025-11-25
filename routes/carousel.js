const express = require("express");
const carousel = require("../models/carousel.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { setConnForRequest } = require("../lib/dbContext");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
function getBucket(companyId) {
  const bucket = process.env[`S3_MAINBUCKET_${companyId}`];
  return bucket;
}

function getR2Bucket(companyId) {
  const bucket = process.env[`R2_BUCKET_NAME_${companyId}`];
  return bucket;
}

function getR2PublicId(companyId) {
  const publicId = process.env[`R2_PUBLIC_ID_${companyId}`];
  return publicId;
}
async function uploadFileToS3(file) {
  const folderPath = "Carousel/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}
async function uploadFileToR2(file, companyId) {
  const bucket = getR2Bucket(companyId);
  const publicId = getR2PublicId(companyId);
  if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);
  if (!publicId) throw new Error(`No R2 public ID configured for ${companyId}`);

  const folderPath = "Carousel/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: bucket,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await r2Client.send(new PutObjectCommand(uploadParams));
  return `https://pub-${publicId}.r2.dev/${fileKey}`;
}
async function smartDeleteFile(fileUrl, companyId) {
  try {
    if (
      fileUrl.includes("r2.dev") ||
      fileUrl.includes("r2.cloudflarestorage.com")
    ) {
      let fileKey;
      if (fileUrl.includes("r2.dev")) {
        const urlParts = fileUrl.split("r2.dev/");
        fileKey = urlParts[1];
      } else {
        const urlParts = fileUrl.split(".r2.cloudflarestorage.com/");
        const pathParts = urlParts[1].split("/");
        fileKey = pathParts.slice(1).join("/");
      }

      const bucket = getR2Bucket(companyId);
      if (!bucket) throw new Error(`No R2 bucket configured for ${companyId}`);

      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        })
      );
    } else {
      const url = new URL(fileUrl);
      const key = decodeURIComponent(url.pathname.substring(1));
      const bucket = getBucket(companyId);
      if (bucket) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
      }
    }
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

router.use(async (req, res, next) => {
  try {
    setConnForRequest(req.db);
    const companyId = req.headers["x-company-id"];
    req.companyId = companyId;
    req.bucket = getBucket(companyId);
    req.r2Bucket = getR2Bucket(companyId);
    await carousel
      .findOne()
      .limit(1)
      .catch(() => {});
    next();
  } catch (error) {
    console.error("Middleware error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
      error: error.message,
    });
  }
});

// User Get All Carousels
router.get("/api/client/getallcarousels", async (req, res) => {
  try {
    const carousels = await carousel.find({ status: true }).sort({ order: 1 });
    res.status(200).json({
      success: true,
      message: "Carousel retrieved successfully",
      carousels,
    });
  } catch (error) {
    console.error("Error occurred while retrieving carousel:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Get All Carousel
router.get("/admin/api/carousel", authenticateAdminToken, async (req, res) => {
  try {
    const carousels = await carousel.find({}).sort({ order: 1 });
    res.status(200).json({
      success: true,
      message: "Carousel retrieved successfully",
      data: carousels,
    });
  } catch (error) {
    console.error("Error occurred while retrieving carousel:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Create Carousel
router.post(
  "/admin/api/createcarousel",
  authenticateAdminToken,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
    { name: "image4", maxCount: 1 },
    { name: "image5", maxCount: 1 },
    { name: "image6", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const { name, link, status, order } = req.body;
      if (!req.files || (!req.files.image && !req.files.image2)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "At least one image file is required",
            zh: "至少需要提供一张图片",
          },
        });
      }
      let imageUrl = null;
      if (req.files.image) {
        imageUrl = await uploadFileToR2(req.files.image[0], req.companyId);
      }
      let imageUrl2 = null;
      if (req.files.image2) {
        imageUrl2 = await uploadFileToR2(req.files.image2[0], req.companyId);
      }
      let imageUrl3 = null;
      if (req.files.image3) {
        imageUrl3 = await uploadFileToR2(req.files.image3[0], req.companyId);
      }

      let imageUrl4 = null;
      if (req.files.image4) {
        imageUrl4 = await uploadFileToR2(req.files.image4[0], req.companyId);
      }

      let imageUrl5 = null;
      if (req.files.image5) {
        imageUrl5 = await uploadFileToR2(req.files.image5[0], req.companyId);
      }

      let imageUrl6 = null;
      if (req.files.image6) {
        imageUrl6 = await uploadFileToR2(req.files.image6[0], req.companyId);
      }
      const newCarousel = await carousel.create({
        name,
        link: imageUrl,
        link2: imageUrl2,
        link3: imageUrl3,
        link4: imageUrl4,
        link5: imageUrl5,
        link6: imageUrl6,
        status: status === "true",
        order: parseInt(order),
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel created successfully",
          zh: "轮播图创建成功",
        },
        data: newCarousel,
      });
    } catch (error) {
      console.error("Error occurred while creating carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Carousel
router.patch(
  "/admin/api/updatecarousel/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
    { name: "image4", maxCount: 1 },
    { name: "image5", maxCount: 1 },
    { name: "image6", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      setConnForRequest(req.db);
      const { id } = req.params;
      const {
        name,
        status,
        order,
        removeImage,
        removeImage2,
        removeImage3,
        removeImage4,
        removeImage5,
        removeImage6,
      } = req.body;
      const existingCarousel = await carousel.findById(id);
      if (!existingCarousel) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "轮播图未找到",
          },
        });
      }
      let imageUrl = existingCarousel.link;
      let imageUrl2 = existingCarousel.link2;
      let imageUrl3 = existingCarousel.link3;
      let imageUrl4 = existingCarousel.link4;
      let imageUrl5 = existingCarousel.link5;
      let imageUrl6 = existingCarousel.link6;
      if (removeImage === "true") {
        if (imageUrl) {
          await smartDeleteFile(imageUrl, req.companyId);
        }
        imageUrl = null;
      } else if (req.files && req.files.image) {
        if (imageUrl) {
          await smartDeleteFile(imageUrl, req.companyId);
        }
        imageUrl = await uploadFileToR2(req.files.image[0], req.companyId);
      }

      if (removeImage2 === "true") {
        if (imageUrl2) {
          await smartDeleteFile(imageUrl2, req.companyId);
        }
        imageUrl2 = null;
      } else if (req.files && req.files.image2) {
        if (imageUrl2) {
          await smartDeleteFile(imageUrl2, req.companyId);
        }
        imageUrl2 = await uploadFileToR2(req.files.image2[0], req.companyId);
      }

      if (removeImage3 === "true") {
        if (imageUrl3) {
          await smartDeleteFile(imageUrl3, req.companyId);
        }
        imageUrl3 = null;
      } else if (req.files && req.files.image3) {
        if (imageUrl3) {
          await smartDeleteFile(imageUrl3, req.companyId);
        }
        imageUrl3 = await uploadFileToR2(req.files.image3[0], req.companyId);
      }

      if (removeImage4 === "true") {
        if (imageUrl4) {
          await smartDeleteFile(imageUrl4, req.companyId);
        }
        imageUrl4 = null;
      } else if (req.files && req.files.image4) {
        if (imageUrl4) {
          await smartDeleteFile(imageUrl4, req.companyId);
        }
        imageUrl4 = await uploadFileToR2(req.files.image4[0], req.companyId);
      }

      if (removeImage5 === "true") {
        if (imageUrl5) {
          await smartDeleteFile(imageUrl5, req.companyId);
        }
        imageUrl5 = null;
      } else if (req.files && req.files.image5) {
        if (imageUrl5) {
          await smartDeleteFile(imageUrl5, req.companyId);
        }
        imageUrl5 = await uploadFileToR2(req.files.image5[0], req.companyId);
      }

      if (removeImage6 === "true") {
        if (imageUrl6) {
          await smartDeleteFile(imageUrl6, req.companyId);
        }
        imageUrl6 = null;
      } else if (req.files && req.files.image6) {
        if (imageUrl6) {
          await smartDeleteFile(imageUrl6, req.companyId);
        }
        imageUrl6 = await uploadFileToR2(req.files.image6[0], req.companyId);
      }
      const updateData = {
        name,
        link: imageUrl,
        link2: imageUrl2,
        link3: imageUrl3,
        link4: imageUrl4,
        link5: imageUrl5,
        link6: imageUrl6,
        status: status === "true",
        order: parseInt(order),
      };
      const updatedCarousel = await carousel.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel updated successfully",
          zh: "轮播图更新成功",
        },
        data: updatedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while updating carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Delete Carousel
router.delete(
  "/admin/api/deletecarousel/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const carouselItem = await carousel.findById(req.params.id);
      if (!carouselItem) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "未找到轮播图",
          },
        });
      }
      if (carouselItem.link) {
        await smartDeleteFile(carouselItem.link, req.companyId);
      }

      if (carouselItem.link2) {
        await smartDeleteFile(carouselItem.link2, req.companyId);
      }
      if (carouselItem.link3) {
        await smartDeleteFile(carouselItem.link3, req.companyId);
      }
      if (carouselItem.link4) {
        await smartDeleteFile(carouselItem.link4, req.companyId);
      }
      if (carouselItem.link5) {
        await smartDeleteFile(carouselItem.link5, req.companyId);
      }
      if (carouselItem.link6) {
        await smartDeleteFile(carouselItem.link6, req.companyId);
      }
      const deletedCarousel = await carousel.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel deleted successfully",
          zh: "轮播图删除成功",
        },
        data: deletedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while deleting carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Carousel Status
router.patch(
  "/admin/api/updatecarouselstatus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id, status } = req.body;
      const updatedCarousel = await carousel.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );
      if (!updatedCarousel) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "未找到轮播图",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel status updated successfully",
          zh: "轮播图状态更新成功",
        },
        data: updatedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while updating carousel status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

module.exports = router;
