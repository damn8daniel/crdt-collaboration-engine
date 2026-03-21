import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice',
      password: passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob',
      password: passwordHash,
    },
  });

  const doc = await prisma.document.create({
    data: {
      title: 'Welcome Document',
      language: 'typescript',
      ownerId: alice.id,
      permissions: {
        create: [
          { userId: alice.id, role: 'OWNER' },
          { userId: bob.id, role: 'EDITOR' },
        ],
      },
    },
  });

  console.log(`Seeded users: ${alice.id}, ${bob.id}`);
  console.log(`Seeded document: ${doc.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
