import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(3, "Title must have atleast 3 characters"),
});

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6, "Password too short"),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string(),
});
