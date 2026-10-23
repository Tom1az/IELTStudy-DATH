import express from "express";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import userController from "../controllers/user.ts";

const router = express.Router();

router
  .route("/")
  .get(userController.index)
  .post(validateBody(schemas.userSchema), userController.newUser);

router
  .route("/:userID")
  .get(validateParams(schemas.idSchema, "userID"), userController.getUser)
  .put(
    validateParams(schemas.idSchema, "userID"),
    validateBody(schemas.userSchema),
    userController.replaceUser,
  )
  .patch(
    validateParams(schemas.idSchema, "userID"),
    validateBody(schemas.userUpdateSchema),
    userController.updateUser,
  );

export default router;
