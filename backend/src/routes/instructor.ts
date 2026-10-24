import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";

import coursesController from "../controllers/courses.ts";

const router = express.Router();

router.use(authenticate, authorize("instructor"));

router.get("/courses", coursesController.listMyCourses);

export default router;
