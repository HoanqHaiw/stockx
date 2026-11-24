import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { api, ApiError, base64ToBlob, downloadFile, saveBlob } from '../../lib/api';
import type { ImportResult } from '../../lib/types';
import { Button, ErrorBanner, Modal } from '../../components/ui';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nhập vật tư qua 2 bước: kiểm tra trước → xác nhận ghi. */
export function ImportMaterialsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // API trả 422 kèm danh sách lỗi khi file có dòng sai: vẫn là một kết quả để hiển thị.
  const upload = (dryRun: boolean) => {
    const body = new FormData();
    body.append('file', file!);
    return api<ImportResult>(`/materials/import${dryRun ? '?dryRun=true' : ''}`, {
      method: 'POST',
      body,
      okStatuses: [422],
    });
  };

  const check = useMutation({ mutationFn: () => upload(true), onSuccess: setResult });
  const run = useMutation({
    mutationFn: () => upload(false),
    onSuccess: (r) => {
      setResult(r);
      if (r.applied) void qc.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  function close() {
    setFile(null);
    setResult(null);
    run.reset();
    check.reset();
    onClose();
  }

  const error = (check.error ?? run.error) as ApiError | null;
  const canApply = result && !result.applied && result.errors.length === 0 && result.total > 0;

  return (
    <Modal
      open={open}
      title="Nhập vật tư từ Excel"
      onClose={close}
      wide
      footer={
        result?.applied ? (
          <Button variant="primary" onClick={close}>
            Xong
          </Button>
        ) : (
          <>
            <Button onClick={close}>Huỷ</Button>
            {canApply ? (
              <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? 'Đang nhập…' : `Xác nhận nhập ${result.total} dòng`}
              </Button>
            ) : (
              <Button variant="primary" disabled={!file || check.isPending} onClick={() => check.mutate()}>
                {check.isPending ? 'Đang kiểm tra…' : 'Kiểm tra file'}
              </Button>
            )}
          </>
        )
      }
    >
      {error && <ErrorBanner message={error.message} />}

      {!result?.applied && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Chưa có file? Tải file mẫu kèm danh sách mã nhóm và ĐVT.</span>
            <Button variant="ghost" className="px-2" onClick={() => void downloadFile('/materials/import-template', 'mau-nhap-vat-tu.xlsx')}>
              <Download className="size-4" /> File mẫu
            </Button>
          </div>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-teal-500">
            <FileSpreadsheet className="size-8 text-teal-600" />
            <span className="text-sm font-medium">{file ? file.name : 'Chọn file .xlsx'}</span>
            <span className="text-xs text-slate-500">Mã đã có sẽ được cập nhật, mã mới sẽ được tạo. Tối đa 2.000 dòng.</span>
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                check.reset();
                run.reset();
              }}
            />
          </label>
        </div>
      )}

      {result && result.errors.length === 0 && !result.applied && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          File hợp lệ: <b>{result.toCreate}</b> vật tư mới, <b>{result.toUpdate}</b> vật tư cập nhật.
        </div>
      )}

      {result?.applied && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="font-medium">Đã nhập {result.total} dòng</p>
          <p className="text-sm text-slate-500">
            {result.toCreate} vật tư mới, {result.toUpdate} vật tư được cập nhật.
          </p>
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
              <AlertTriangle className="size-4" /> {result.errors.length}/{result.total} dòng lỗi, chưa ghi dòng nào
            </p>
            {result.errorFile && (
              <Button variant="danger" onClick={() => saveBlob(base64ToBlob(result.errorFile!, XLSX), 'vat-tu-loi.xlsx')}>
                <Download className="size-4" /> Tải file lỗi
              </Button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dòng</th>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={e.row} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 tabular-nums">{e.row}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.code || '—'}</td>
                    <td className="px-3 py-2">
                      <ul className="list-disc pl-4 text-red-700">
                        {e.messages.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
