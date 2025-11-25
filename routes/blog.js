const express = require("express");
const router = express.Router();
const Blog = require("../models/blog.model");
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 20 * 1024 * 1024, // 20MB字段大小限制
    fileSize: 10 * 1024 * 1024, // 10MB文件大小限制
  },
});
async function uploadFileToS3(file) {
  const folderPath = "blog/";
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

// Generate Slug
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
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
      Key: `blog/${fileName}`,
      Body: buffer,
      ContentType: mimeType,
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/blog/${fileName}`;
  } catch (error) {
    console.error("Error processing base64 image:", error);
    throw error;
  }
}

// Get Unique Blogs When User Clicked
router.get("/api/blogs/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      isVisible: true,
    });
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching blog",
      error: error.message,
    });
  }
});

// Get Blogs for User
router.get("/api/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find({ isVisible: true }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: blogs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching blogs",
      error: error.message,
    });
  }
});

// Admin Get All Blogs
router.get("/admin/api/allblogs", authenticateAdminToken, async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: blogs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching blogs",
      error: error.message,
    });
  }
});

// Admin Create Blog
router.post(
  "/admin/api/blogs",
  authenticateAdminToken,
  upload.fields([{ name: "image", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        title,
        titleCN,
        description,
        descriptionCN,
        content,
        contentCN,
        metaTitle,
        metaTitleCN,
        metaDescription,
        metaDescriptionCN,
        isVisible,
      } = req.body;
      if (!title || !description || !content) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Title, description and content are required",
            zh: "标题、描述和内容是必需的",
          },
        });
      }
      let imageUrl = null;
      if (req.files.image && req.files.image[0]) {
        try {
          imageUrl = await uploadFileToS3(req.files.image[0]);
        } catch (error) {
          console.error("Error uploading image to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload image. Please try again.",
              zh: "上传图片失败，请重试。",
            },
          });
        }
      } else {
        return res.status(200).json({
          success: false,
          message: {
            en: "Image is required",
            zh: "图片是必需的",
          },
        });
      }
      let contentProcessed = content;
      let contentCNProcessed = contentCN;
      const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
      const base64Matches = content.match(base64Regex);
      if (base64Matches) {
        for (const base64Match of base64Matches) {
          const base64String = base64Match.substring(5, base64Match.length - 1);
          try {
            const imageUrl = await handleBase64Image(base64String);
            contentProcessed = contentProcessed.replace(base64String, imageUrl);
          } catch (error) {
            console.error("Error processing image in content:", error);
          }
        }
      }
      if (contentCN) {
        const base64MatchesCN = contentCN.match(base64Regex);
        if (base64MatchesCN) {
          for (const base64Match of base64MatchesCN) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Image(base64String);
              contentCNProcessed = contentCNProcessed.replace(
                base64String,
                imageUrl
              );
            } catch (error) {
              console.error("Error processing image in contentCN:", error);
            }
          }
        }
      }
      const slug = generateSlug(title);
      const blog = new Blog({
        title,
        titleCN,
        description,
        descriptionCN,
        content: contentProcessed,
        contentCN: contentCNProcessed,
        metaTitle,
        metaTitleCN,
        metaDescription,
        metaDescriptionCN,
        image: imageUrl,
        slug,
        isVisible: isVisible === "true",
      });
      const savedBlog = await blog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Blog created successfully",
          zh: "博客创建成功",
        },
        data: savedBlog,
      });
    } catch (error) {
      console.error("Error creating blog:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating blog",
          zh: "创建博客时出错",
        },
      });
    }
  }
);

// Admin Update Blog
router.put(
  "/admin/api/blogs/:id",
  authenticateAdminToken,
  upload.fields([{ name: "image", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        title,
        titleCN,
        description,
        descriptionCN,
        content,
        contentCN,
        metaTitle,
        metaTitleCN,
        metaDescription,
        metaDescriptionCN,
        isVisible,
      } = req.body;
      const oldBlog = await Blog.findById(req.params.id);
      if (!oldBlog) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Blog not found",
            zh: "找不到博客",
          },
        });
      }
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      const oldImages = new Set();
      let match;
      while ((match = imgRegex.exec(oldBlog.content)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          oldImages.add(imageUrl);
        }
      }
      let contentProcessed = content;
      let contentCNProcessed = contentCN;
      const newImages = new Set();
      const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
      const base64Matches = content.match(base64Regex);
      if (base64Matches) {
        for (const base64Match of base64Matches) {
          const base64String = base64Match.substring(5, base64Match.length - 1);
          try {
            const imageUrl = await handleBase64Image(base64String);
            contentProcessed = contentProcessed.replace(base64String, imageUrl);
            newImages.add(imageUrl);
          } catch (error) {
            console.error("Error processing image in content:", error);
          }
        }
      }
      const base64MatchesCN = contentCN.match(base64Regex);
      if (base64MatchesCN) {
        for (const base64Match of base64MatchesCN) {
          const base64String = base64Match.substring(5, base64Match.length - 1);
          try {
            const imageUrl = await handleBase64Image(base64String);
            contentCNProcessed = contentCNProcessed.replace(
              base64String,
              imageUrl
            );
            newImages.add(imageUrl);
          } catch (error) {
            console.error("Error processing image in contentCN:", error);
          }
        }
      }
      while ((match = imgRegex.exec(contentProcessed)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          newImages.add(imageUrl);
        }
      }
      while ((match = imgRegex.exec(contentCNProcessed)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          newImages.add(imageUrl);
        }
      }
      const urlsToDelete = Array.from(oldImages).filter(
        (url) => !newImages.has(url)
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
      const updates = {
        title,
        titleCN,
        description,
        descriptionCN,
        content: contentProcessed,
        contentCN: contentCNProcessed,
        metaTitle,
        metaTitleCN,
        metaDescription,
        metaDescriptionCN,
        isVisible: isVisible === "true",
        slug: generateSlug(title),
      };
      if (req.files.image && req.files.image[0]) {
        if (oldBlog.image) {
          const oldImageUrl = oldBlog.image;
          const oldKey = oldImageUrl.split("/").slice(-2).join("/");
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_MAINBUCKET,
                Key: oldKey,
              })
            );
          } catch (error) {
            console.error("Error deleting old image from S3:", error);
            return res.status(500).json({
              success: false,
              message: {
                en: "Failed to delete old image from S3",
                zh: "从S3删除旧图像失败",
              },
              error: error.message,
            });
          }
        }
        try {
          const newImageUrl = await uploadFileToS3(req.files.image[0]);
          updates.image = newImageUrl;
        } catch (error) {
          console.error("Error uploading new image to S3:", error);
          return res.status(400).json({
            success: false,
            message: {
              en: "Failed to upload new image. Please try again",
              zh: "上传新图像失败，请重试",
            },
          });
        }
      }
      const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, updates, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Blog updated successfully",
          zh: "博客更新成功",
        },
        data: updatedBlog,
      });
    } catch (error) {
      console.error("Error updating blog:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating blog",
          zh: "更新博客时出错",
        },
      });
    }
  }
);

// Admin Delete Blog
router.delete(
  "/admin/api/blogs/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const blogToDelete = await Blog.findById(req.params.id);
      if (!blogToDelete) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Blog not found",
            zh: "找不到博客",
          },
        });
      }
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      const imagesToDelete = new Set();
      let match;
      while ((match = imgRegex.exec(blogToDelete.content)) !== null) {
        const imageUrl = match[1];
        if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
          imagesToDelete.add(imageUrl);
        }
      }
      for (const imageUrl of imagesToDelete) {
        try {
          const key = imageUrl.split(".com/")[1];
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        } catch (error) {
          console.error("Error deleting content image:", error);
        }
      }
      if (blogToDelete.image) {
        const imageUrl = blogToDelete.image;
        const key = imageUrl.split("/").slice(-2).join("/");
        const deleteParams = {
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        };
        try {
          await s3Client.send(new DeleteObjectCommand(deleteParams));
        } catch (error) {
          console.error("Error deleting image from S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to delete image from S3",
              zh: "从S3删除图像失败",
            },
          });
        }
      }
      await Blog.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Blog deleted successfully",
          zh: "博客删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting blog:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting blog",
          zh: "删除博客时出错",
        },
      });
    }
  }
);

// Admin Update Visibility
router.patch(
  "/admin/api/blogs/:id/visibility",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { isVisible } = req.body;
      const updatedBlog = await Blog.findByIdAndUpdate(
        req.params.id,
        { isVisible },
        { new: true }
      );
      if (!updatedBlog) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Blog not found",
            zh: "找不到博客",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: `Blog ${isVisible ? "published" : "unpublished"} successfully`,
          zh: `博客${isVisible ? "发布" : "取消发布"}成功`,
        },
        data: updatedBlog,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating blog visibility",
          zh: "更新博客可见性时出错",
        },
      });
    }
  }
);

module.exports = router;
