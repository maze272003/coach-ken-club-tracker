import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const scrypt = new Scrypt();

const INVALID_CREDENTIALS = "Invalid email or password";

/**
 * A single "password" sign-in provider that routes to:
 * - the coach account, validated against server-side environment
 *   variables (COACH_EMAIL / COACH_PASSWORD), never exposed to the client
 * - student accounts, validated against their scrypt-hashed password
 *
 * There is no public sign-up flow: student accounts are created
 * exclusively by the coach.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials<DataModel>({
      id: "password",
      async authorize(params, ctx) {
        const email =
          typeof params.email === "string"
            ? params.email.trim().toLowerCase()
            : "";
        const password =
          typeof params.password === "string" ? params.password : "";
        if (email === "" || password === "") {
          throw new ConvexError(INVALID_CREDENTIALS);
        }

        const coachEmail = process.env.COACH_EMAIL?.trim().toLowerCase();
        const coachPassword = process.env.COACH_PASSWORD;

        // Coach: validate against environment credentials.
        if (coachEmail && coachPassword && email === coachEmail) {
          if (password !== coachPassword) {
            throw new ConvexError(INVALID_CREDENTIALS);
          }
          const result = await ctx.runMutation(
            internal.users.findOrCreateCoach,
            {
              email,
              name: process.env.COACH_NAME ?? "Coach",
            },
          );
          if (!result.ok) {
            throw new ConvexError(INVALID_CREDENTIALS);
          }
          return { userId: result.userId };
        }

        // Student: validate against the stored password hash.
        let retrieved: Awaited<ReturnType<typeof retrieveAccount>>;
        try {
          retrieved = await retrieveAccount(ctx, {
            provider: "password",
            account: { id: email, secret: password },
          });
        } catch {
          throw new ConvexError(INVALID_CREDENTIALS);
        }
        if (retrieved === null || retrieved.user.role !== "student") {
          throw new ConvexError(INVALID_CREDENTIALS);
        }

        const status = await ctx.runQuery(internal.users.studentStatus, {
          userId: retrieved.user._id,
        });
        if (status === "inactive") {
          throw new ConvexError(
            "This account has been deactivated. Contact your coach.",
          );
        }

        return { userId: retrieved.user._id };
      },
      crypto: {
        async hashSecret(pw: string) {
          return await scrypt.hash(pw);
        },
        async verifySecret(pw: string, hash: string) {
          return await scrypt.verify(hash, pw);
        },
      },
    }),
  ],
});
