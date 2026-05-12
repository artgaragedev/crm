import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ select: { id: true, email: true, role: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
  await p.$disconnect();
})();
