import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUser, resetDb } from './helpers.js';

const app = createApp();
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('Đăng nhập', () => {
  it('trả về token và thông tin người dùng khi đúng mật khẩu', async () => {
    await createUser('WAREHOUSE', 'thukho@test.local', 'Secret@123');
    const res = await login('THUKHO@test.local', 'Secret@123');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'thukho@test.local', role: 'WAREHOUSE' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + res.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('WAREHOUSE');
  });

  it('sai mật khẩu và email không tồn tại trả về cùng một thông báo', async () => {
    await createUser('SALES', 'sales@test.local', 'Secret@123');
    const wrong = await login('sales@test.local', 'nope');
    const missing = await login('ghost@test.local', 'nope');
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it('chặn tài khoản đã bị khoá dù token còn hạn', async () => {
    await createUser('SALES', 'sales@test.local', 'Secret@123');
    const res = await login('sales@test.local', 'Secret@123');
    await prisma.user.update({ where: { email: 'sales@test.local' }, data: { isActive: false } });
    const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + res.body.token);
    expect(me.status).toBe(401);
  });

  it('API danh mục yêu cầu đăng nhập và dữ liệu đầu vào được kiểm tra', async () => {
    expect((await request(app).get('/api/master/warehouses')).status).toBe(401);
    const bad = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(bad.status).toBe(400);
  });
});
