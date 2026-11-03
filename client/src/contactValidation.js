import { z } from "zod";

export const contactServices = [
  "Web Development",
  "Cloud Engineering",
  "UI/UX & Graphic Design",
  "Technical Writing",
  "Other",
];

export const inquiryFormSchema = z.object({
  name: z.string().trim()
    .min(2, "Please enter at least 2 characters.")
    .max(100, "Please keep your name under 100 characters."),
  email: z.string().trim()
    .email("Enter a valid email address.")
    .max(254, "Please use an email address under 254 characters.")
    .toLowerCase(),
  service: z.enum(contactServices, { error: "Choose one of the listed services." }),
  message: z.string().trim()
    .min(10, "Please add at least 10 characters about your project.")
    .max(3000, "Please keep project details under 3000 characters."),
});
