import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";

describe("Client extensions transactions bug reporduction", () => {
  const prisma = new PrismaClient();
  const xprisma = prisma.$extends({
    query: {
      user: {
        create: async ({ query, args }) => {
          const result = await query(args);

          if (!("id" in result) || typeof result.id !== "number") {
            throw new Error("User not created");
          }

          await prisma.log.create({
            data: {
              text: "User created",
            },
          });

          return result;
        },
      },
    },
  });

  beforeAll(async () => {
    await prisma.user.deleteMany();
    await prisma.log.deleteMany();
  });

  it("should rollback queries executed inside the extension while the extension is running", async () => {
    // Act
    try {
      await xprisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            name: "johndoe@example.com",
          },
        });

        throw new Error("Rollback");
      });
    } catch (error) {}

    // Assert
    const users = await prisma.user.findMany();
    const logs = await xprisma.log.findMany();

    // This assertion passes
    expect(users).toHaveLength(0);

    // This assertion fails
    expect(logs).toHaveLength(0);
  });
});
