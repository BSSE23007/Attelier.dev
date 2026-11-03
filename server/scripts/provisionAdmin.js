import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import mongoose from "mongoose";
import { z } from "zod";
import Admin from "../src/models/Admin.js";
import { hashPassword, passwordStrengthError } from "../src/security/adminCredentials.js";

class ProvisioningInputError extends Error {}

async function promptLine(prompt) {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

function promptHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new ProvisioningInputError("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const originalRawMode = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(originalRawMode);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Provisioning cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else if (character >= " ") {
          password += character;
        }
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function provision() {
  if (!process.env.MONGODB_URI) {
    throw new ProvisioningInputError("MONGODB_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  if (await Admin.exists({})) {
    throw new ProvisioningInputError("An administrator already exists; refusing to make changes.");
  }

  const email = z.string().trim().email().max(254).safeParse(await promptLine("Administrator email: "));
  if (!email.success) throw new ProvisioningInputError("Enter a valid administrator email address.");

  let password = await promptHidden("Password (input hidden): ");
  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    password = "";
    throw new ProvisioningInputError(strengthError);
  }

  const confirmation = await promptHidden("Confirm password (input hidden): ");
  if (password !== confirmation) {
    password = "";
    throw new ProvisioningInputError("Passwords do not match.");
  }

  const passwordHash = await hashPassword(password);
  password = "";
  await Admin.create({ email: email.data.toLowerCase(), passwordHash });
  console.log("Administrator provisioned successfully.");
}

try {
  await provision();
} catch (error) {
  console.error(error instanceof ProvisioningInputError ? error.message : "Provisioning failed. Check database connectivity and try again.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
