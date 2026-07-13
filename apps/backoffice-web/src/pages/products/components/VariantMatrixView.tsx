import { useCallback, useEffect, useState } from "react";
import { formatClientError } from "@erp/api-client";
import { Loader2, RefreshCw } from "lucide-react";
import { AppModal, Button } from "@erp/ui";
import {
  productsApi,
  type AttributeDefinition,
  type StockBalance,
  type Variant,
} from "../../../api/products";

interface VariantMatrixViewProps {
  productId: string;
}

export function VariantMatrixView({ productId }: VariantMatrixViewProps) {
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attrsRes, itemsRes, stockRes] = await Promise.all([
        productsApi.listAttributes(productId),
        productsApi.listItems(productId, { pageSize: 500, includeInactive: true }),
        productsApi.listStockBalances(productId, { pageSize: 500 }),
      ]);

      const attrs = Array.isArray(attrsRes.data)
        ? attrsRes.data
        : ((attrsRes.data as any).data ?? []);
      setAttributes(attrs);

      const items = itemsRes.data.data ?? [];
      setVariants(items);

      const balances = stockRes.data.data ?? [];
      setStockBalances(balances);
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const expectedCount = attributes.reduce(
    (acc, attr) => acc * Math.max(attr.options.length, 1),
    attributes.length > 0 ? 1 : 0,
  );

  const handleGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data } = await productsApi.generateVariants(productId);
      setSuccessMsg(`Đã sinh ${data.created} biến thể thành công.`);
      await fetchData();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setGenerating(false);
    }
  };

  const stockByItem = new Map<string, number>();
  for (const b of stockBalances) {
    stockByItem.set(b.itemId, (stockByItem.get(b.itemId) ?? 0) + b.quantity);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Đang tải biến thể…
        </span>
      </div>
    );
  }

  const canRenderMatrix =
    attributes.length === 2 &&
    attributes[0].options.length > 0 &&
    attributes[1].options.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {variants.length > 0
            ? `${variants.length} biến thể`
            : "Chưa có biến thể nào."}
          {attributes.length > 0 &&
            ` · ${attributes.length} thuộc tính · Dự kiến ${expectedCount} biến thể`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={generating}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Tải lại
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={generating || attributes.length === 0}
            onClick={() => setShowConfirm(true)}
          >
            {generating && (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            )}
            Sinh biến thể
          </Button>
        </div>
      </div>

      {canRenderMatrix ? (
        <MatrixTable
          attributes={attributes}
          variants={variants}
          stockByItem={stockByItem}
        />
      ) : (
        <FlatTable variants={variants} stockByItem={stockByItem} />
      )}

      {showConfirm && (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) setShowConfirm(false);
          }}
          title="Sinh biến thể"
          onSave={() => void handleGenerate()}
          onCancel={() => setShowConfirm(false)}
          saveLabel="Xác nhận"
          cancelLabel="Huỷ"
          className="max-w-[420px]"
          bodyStretch={false}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Xác nhận sinh {expectedCount} biến thể? Các biến thể đã tồn tại sẽ
            được giữ nguyên.
          </p>
        </AppModal>
      )}
    </div>
  );
}

function MatrixTable({
  attributes,
  variants,
  stockByItem,
}: {
  attributes: AttributeDefinition[];
  variants: Variant[];
  stockByItem: Map<string, number>;
}) {
  const [rowAttr, colAttr] = attributes;

  const variantMap = new Map<string, Variant>();
  for (const v of variants) {
    variantMap.set(v.variantLabel, v);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b-2 border-r border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold">
              {rowAttr.name} \ {colAttr.name}
            </th>
            {colAttr.options.map((colOpt) => (
              <th
                key={colOpt.id}
                className="border-b-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-xs font-semibold"
              >
                {colOpt.valueLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowAttr.options.map((rowOpt) => (
            <tr key={rowOpt.id} className="border-b border-gray-100">
              <td className="border-r border-gray-200 bg-gray-50/50 px-3 py-2 text-xs font-medium">
                {rowOpt.valueLabel}
              </td>
              {colAttr.options.map((colOpt) => {
                const label = `${rowOpt.valueLabel} / ${colOpt.valueLabel}`;
                const altLabel = `${colOpt.valueLabel} / ${rowOpt.valueLabel}`;
                const variant =
                  variantMap.get(label) ?? variantMap.get(altLabel);
                const qty = variant ? (stockByItem.get(variant.id) ?? 0) : null;

                return (
                  <td key={colOpt.id} className="px-3 py-2 text-center">
                    {variant ? (
                      <div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {variant.code}
                        </div>
                        <div className="text-sm font-medium">
                          {qty != null ? qty : "–"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlatTable({
  variants,
  stockByItem,
}: {
  variants: Variant[];
  stockByItem: Map<string, number>;
}) {
  if (variants.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-muted-foreground">
        Chưa có biến thể nào. Hãy thêm thuộc tính rồi bấm "Sinh biến thể".
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-44 border-b-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold">
              Mã SKU
            </th>
            <th className="w-[280px] border-b-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold">
              Tên hàng hóa
            </th>
            <th className="w-40 border-b-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold">
              Nhãn biến thể
            </th>
            <th className="w-32 border-b-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-right text-xs font-semibold">
              Tồn kho
            </th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} className="border-b border-gray-100">
              <td className="px-3 py-2 font-mono text-xs break-all">
                {v.code}
              </td>
              <td className="px-3 py-2">{v.name || v.productName || "—"}</td>
              <td className="px-3 py-2">{v.variantLabel || "—"}</td>
              <td className="px-3 py-2 text-right">
                {stockByItem.get(v.id) ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
