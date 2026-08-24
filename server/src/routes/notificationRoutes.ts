import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listMyNotifications } from "../controllers/notificationController";

const router = Router();

router.use(requireAuth);
router.get("/mine", listMyNotifications);

export default router;
