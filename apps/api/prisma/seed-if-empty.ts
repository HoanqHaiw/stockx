/**
 * Dùng khi khởi động trên môi trường demo: CSDL chưa có người dùng nào thì nạp dữ liệu mẫu,
 * đã có dữ liệu thì bỏ qua (không bao giờ xoá dữ liệu đang dùng).
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const users = await prisma.user.count();
await prisma.$disconnect();

if (users > 0) {
  console.log(`CSDL đã có ${users} người dùng, bỏ qua seed.`);
} else {
  console.log('CSDL trống, nạp dữ liệu mẫu...');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}
