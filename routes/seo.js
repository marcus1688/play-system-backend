const express = require("express");
const router = express.Router();
const SEOPage = require("../models/seo.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
async function uploadFileToS3(file) {
  const folderPath = "seo/";
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

async function handleBase64Image(base64String) {
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 string");
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");
    const fileExt = mimeType.split("/")[1];
    const fileName = `${Date.now()}.${fileExt}`;
    const uploadParams = {
      Bucket: process.env.S3_MAINBUCKET,
      Key: `seo/${fileName}`,
      Body: buffer,
      ContentType: mimeType,
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/seo/${fileName}`;
  } catch (error) {
    console.error("Error processing base64 image:", error);
    throw error;
  }
}

router.get("/api/seo-pages", async (req, res) => {
  try {
    const pages = await SEOPage.find({ isVisible: true });
    res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching SEO pages",
      error: error.message,
    });
  }
});

// Get Specific Seo Pages
router.get("/api/seo-pages/:pageType", async (req, res) => {
  try {
    const page = await SEOPage.findOne({
      pageType: req.params.pageType,
      isVisible: true,
    });
    if (!page) {
      return res.status(404).json({
        success: false,
        message: "SEO page not found",
      });
    }
    res.status(200).json({
      success: true,
      data: page,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching SEO page",
      error: error.message,
    });
  }
});

// Admin Get All Seo Pages
router.get("/admin/api/seo-pages", authenticateAdminToken, async (req, res) => {
  try {
    const pages = await SEOPage.find();
    res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching SEO pages",
      error: error.message,
    });
  }
});

//Admin Create Seo Pages
router.post(
  "/admin/api/seo-pages",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { pageType } = req.body;
      const page = new SEOPage({
        pageType,
        contentBlocks: [],
      });
      const savedPage = await page.save();
      res.status(200).json({
        success: true,
        message: {
          en: "SEO page created successfully",
          zh: "SEO页面创建成功",
        },
        data: savedPage,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating SEO page",
          zh: "创建SEO页面时出错",
        },
      });
    }
  }
);

// Admin Delete Seo Pages
router.delete(
  "/admin/api/seo-pages/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.id);
      if (!page) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SEO page not found",
            zh: "找不到SEO页面",
          },
        });
      }
      for (const block of page.contentBlocks) {
        const content = block.content;
        const imgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        const imageUrls = [];

        while ((match = imgRegex.exec(content)) !== null) {
          const imageUrl = match[1];
          if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
            imageUrls.push(imageUrl);
          }
        }
        for (const imageUrl of imageUrls) {
          const key = imageUrl.split(".com/")[1];
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        }
      }
      await SEOPage.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "SEO page deleted successfully",
          zh: "SEO页面删除成功",
        },
      });
    } catch (error) {
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

// Admin toggle Page Visibility
router.patch(
  "/admin/api/seo-pages/:id/visibility",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.id);
      if (!page) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SEO page not found",
            zh: "找不到SEO页面",
          },
        });
      }
      page.isVisible = req.body.isVisible;
      const updatedPage = await page.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Page visibility updated successfully",
          zh: "页面可见性更新成功",
        },
        data: updatedPage,
      });
    } catch (error) {
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

// Admin Get Seo Content
router.get(
  "/admin/api/seo-pages/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.id);
      if (!page) {
        return res.status(404).json({
          success: false,
          message: "SEO page not found",
        });
      }
      if (page.contentBlocks && page.contentBlocks.length > 0) {
        page.contentBlocks.sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      }
      res.status(200).json({
        success: true,
        data: page,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching SEO page",
        error: error.message,
      });
    }
  }
);

// Admin Delete Seo Content
router.delete(
  "/admin/api/seo-pages/:pageId/blocks/:blockId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.pageId);
      if (!page) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SEO page not found",
            zh: "找不到SEO页面",
          },
        });
      }
      const blockIndex = page.contentBlocks.findIndex(
        (block) => block._id.toString() === req.params.blockId
      );
      if (blockIndex === -1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Content block not found",
            zh: "找不到内容",
          },
        });
      }
      const block = page.contentBlocks[blockIndex];
      const content = block.content;
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      const imageUrls = [];
      while ((match = imgRegex.exec(content)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          imageUrls.push(imageUrl);
        }
      }
      for (const imageUrl of imageUrls) {
        const key = imageUrl.split(".com/")[1];
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: key,
          })
        );
      }
      page.contentBlocks.splice(blockIndex, 1);
      page.contentBlocks.forEach((block, index) => {
        block.order = index + 1;
      });
      const updatedPage = await page.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Content block deleted successfully",
          zh: "内容删除成功",
        },
        data: updatedPage,
      });
    } catch (error) {
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

// Admin Create Seo Content
router.post(
  "/admin/api/seo-pages/:pageId/blocks",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.pageId);
      if (!page) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SEO page not found",
            zh: "找不到SEO页面",
          },
        });
      }
      let newContent = req.body.content;
      const newImageUrls = new Set();
      const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
      const base64Matches = newContent.match(base64Regex);
      if (base64Matches) {
        for (const base64Match of base64Matches) {
          const base64String = base64Match.substring(5, base64Match.length - 1);
          try {
            const imageUrl = await handleBase64Image(base64String);
            newContent = newContent.replace(base64String, imageUrl);
            newImageUrls.add(imageUrl);
          } catch (error) {
            console.error("Error processing image in content:", error);
          }
        }
      }
      const newBlock = {
        content: newContent,
        order: req.body.order || page.contentBlocks.length + 1,
      };
      page.contentBlocks.push(newBlock);
      const updatedPage = await page.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Content block created successfully",
          zh: "内容创建成功",
        },
        data: updatedPage,
      });
    } catch (error) {
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

// Admin Update Seo Content
router.put(
  "/admin/api/seo-pages/:pageId/blocks/:blockId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const page = await SEOPage.findById(req.params.pageId);
      if (!page) {
        return res.status(200).json({
          success: false,
          message: {
            en: "SEO page not found",
            zh: "找不到SEO页面",
          },
        });
      }
      const blockIndex = page.contentBlocks.findIndex(
        (block) => block._id.toString() === req.params.blockId
      );
      if (blockIndex === -1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Content block not found",
            zh: "找不到内容",
          },
        });
      }
      const oldBlock = page.contentBlocks[blockIndex];
      const oldImageUrls = new Set();
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(oldBlock.content)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          oldImageUrls.add(imageUrl);
        }
      }
      const newImageUrls = new Set();
      let newContent = req.body.content;
      const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
      const base64Matches = newContent.match(base64Regex);
      if (base64Matches) {
        for (const base64Match of base64Matches) {
          const base64String = base64Match.substring(5, base64Match.length - 1);
          try {
            const imageUrl = await handleBase64Image(base64String);
            newContent = newContent.replace(base64String, imageUrl);
            newImageUrls.add(imageUrl);
          } catch (error) {
            console.error("Error processing image in content:", error);
          }
        }
      }
      while ((match = imgRegex.exec(newContent)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          newImageUrls.add(imageUrl);
        }
      }
      const urlsToDelete = Array.from(oldImageUrls).filter(
        (url) => !newImageUrls.has(url)
      );
      for (const url of urlsToDelete) {
        try {
          const key = url.split(".com/")[1];
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        } catch (error) {
          console.error("Error deleting old image:", error);
        }
      }
      page.contentBlocks[blockIndex].content = newContent;
      page.contentBlocks[blockIndex].order =
        req.body.order || page.contentBlocks[blockIndex].order;
      const updatedPage = await page.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Content block updated successfully",
          zh: "内容更新成功",
        },
        data: updatedPage,
      });
    } catch (error) {
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
