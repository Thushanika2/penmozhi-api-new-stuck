const express = require("express");
const controller = require("../controllers/content");
const { authenticate, rolesRequired } = require("../middleware/auth");

const router = express.Router();
const admin = rolesRequired("admin");
const user = rolesRequired("user");

router.get("/api/education", controller.listEducation);
router.get("/api/education/videos", controller.listVideos);
router.get("/api/education/videos/:video_id", controller.getVideo);
router.get("/api/education/:resource_id", controller.getEducation);
router.post("/api/education", admin, controller.createEducation);
router.put("/api/education/:resource_id", admin, controller.updateEducation);
router.delete("/api/education/:resource_id", admin, controller.deleteEducation);
router.post("/admin/education/videos", admin, controller.createVideo);
router.get("/admin/education/videos", admin, controller.listAdminVideos);
router.post("/admin/education/videos/upload-signature", admin, controller.uploadSignature);
router.put("/admin/education/videos/:video_id", admin, controller.updateVideo);
router.delete("/admin/education/videos/:video_id", admin, controller.deleteVideo);
router.post("/admin/education/:article_id/video", admin, controller.uploadArticleVideo);
router.delete("/admin/education/:article_id/video", admin, controller.deleteArticleVideo);

router.get("/api/forum", authenticate, controller.forumPosts);
router.get("/api/forum/:post_id", authenticate, controller.forumPost);
router.post("/api/forum", user, controller.createForumPost);
router.put("/api/forum/:post_id", user, controller.updateForumPost);
router.delete("/api/forum/:post_id", rolesRequired("user", "admin"), controller.deleteForumPost);
router.post("/api/forum/:post_id/comments", user, controller.createForumComment);

module.exports = router;
