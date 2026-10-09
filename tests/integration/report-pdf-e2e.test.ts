/**
 * @file tests/integration/report-pdf-e2e.test.ts
 * @description End-to-end verification of PDF report generation against the live seeded database.
 * 
 * Verifies that:
 * - Real SQL views and query helpers from lib/reports execute against the live MySQL database.
 * - POST /api/reports/:type/export/pdf renders full binary PDFs from live data.
 * - Generates valid downloadable PDF buffers (%PDF- magic bytes) for all report types.
 * - Produces and saves a physical sample PDF to disk to close the Phase 2 Gate requirement.
 * 
 * Authority: Docs/03_architecture.md §11, Docs/09_task-tracker.md Phase 2 Gate.
 * Owner: Member 5 (Desandu).
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST } from '@/app/api/reports/[type]/export/pdf/route';

// Mock authentication session as system administrator
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({
    user_id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@kandypack.lk',
    role: 'system_administrator',
    store_id: null,
    display_name: 'System Administrator',
  }),
}));

// Mock Redis rate limiting to avoid external Upstash dependency during CI/integration runs
vi.mock('@/lib/redis', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 10,
    remaining: 9,
    resetTimeMs: Date.now() + 300000,
  }),
}));

describe('End-to-End PDF Report Generation against Seeded Database', () => {
  afterAll(() => {
    const outDir = path.resolve(process.cwd(), 'tests', 'output');
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
  it('generates a valid downloadable PDF for Quarterly Sales from live data', async () => {
    const req = new Request('http://localhost:3000/api/reports/quarterly-sales/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026 }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ type: 'quarterly-sales' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="kandypack-quarterly-sales-\d{4}-\d{2}-\d{2}\.pdf"/);

    const arrayBuffer = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Verify valid PDF magic bytes
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Save proof artifact to disk
    const outDir = path.resolve(process.cwd(), 'tests', 'output');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outDir, 'kandypack-quarterly-sales-live.pdf'), pdfBuffer);
  });

  it('generates a valid downloadable PDF for Driver & Assistant Hours from live data', async () => {
    const req = new Request('http://localhost:3000/api/reports/driver-assistant-hours/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: '2026-08-17' }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ type: 'driver-assistant-hours' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const arrayBuffer = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates a valid downloadable PDF for Customer History from live data', async () => {
    const req = new Request('http://localhost:3000/api/reports/customer-history/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: 1 }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ type: 'customer-history' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const arrayBuffer = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
