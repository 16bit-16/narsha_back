import { Schema, model } from "mongoose";
import { trim } from "zod";

const UserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    nickname: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, default: false },
    profileImage: { type: String, default: "" },
  },
  { timestamps: true }
);
export default model("User", UserSchema);
