import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatClientError } from "@erp/api-client";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Badge, Button } from "@erp/ui";
import { productsApi, type Product } from "../../api/products";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { ProductForm } from "./components/ProductForm";
import { AttributeDefinitionsForm } from "./components/AttributeDefinitionsForm";
import { VariantMatrixView } from "./components/VariantMatrixView";

type TabId = "info" | "attributes" | "variants";

const TABS: { id: TabId; label: string }[] = [
  { id: "info", label: "Thông tin chung" },
  { id: "attributes", label: "Thuộc tính" },
  { id: "variants", label: "Biến thể & Tồn kho" },
];

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await productsApi.getById(id);
      setProduct(data);
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchProduct();
  }, [fetchProduct]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setConfirmDelete(false);
    try {
      await productsApi.delete(id);
      navigate("/products");
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AdminPageShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Đang tải…</span>
        </div>
      </AdminPageShell>
    );
  }

  if (error && !product) {
    return (
      <AdminPageShell>
        <button
          type="button"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/products")}
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>
        <p className="text-sm text-destructive">{error}</p>
      </AdminPageShell>
    );
  }

  if (!product) return null;

  return (
    <AdminPageShell>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/products")}
          >
            <ArrowLeft className="h-4 w-4" />
            Sản phẩm
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            <Badge variant={product.isActive ? "default" : "secondary"}>
              {product.isActive ? "Hoạt động" : "Ngừng"}
            </Badge>
          </div>
          {product.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Xoá
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="max-w-lg">
          <ProductForm
            product={product}
            onSaved={(updated) => setProduct(updated)}
          />
        </div>
      )}

      {activeTab === "attributes" && (
        <AttributeDefinitionsForm productId={product.id} />
      )}

      {activeTab === "variants" && (
        <VariantMatrixView productId={product.id} />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xoá sản phẩm"
          message={`Xác nhận xoá sản phẩm "${product.name}"? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xoá"
          cancelLabel="Huỷ"
          loading={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </AdminPageShell>
  );
}
