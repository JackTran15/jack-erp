import { useState } from "react";
import { AppModal, Button, SingleSelect, cn } from "@erp/ui";
import { AlertCircle, Save, Send, X } from "lucide-react";
import { Tabs } from "../../../../components/tabs/Tabs";
import { EINVOICE_SYMBOL_OPTIONS, EINVOICE_TEMPLATE_OPTIONS } from "../_mock/einvoice.mock";
import type { EInvoiceBuyer, EInvoiceRecord, EInvoiceSeller } from "../_lib/einvoice.interface";
import { notifyNotSupported, useEInvoiceMutations } from "../_lib/useEInvoiceMutations";
import { EInvoicePartyForm, type PartyField } from "./EInvoicePartyForm/EInvoicePartyForm";
import { InvoiceLinesSection } from "./InvoiceLinesSection/InvoiceLinesSection";

interface Props {
  record: EInvoiceRecord;
  onClose: () => void;
}

type PartyTab = "buyer" | "seller";

const PARTY_TABS = [
  { id: "buyer", label: "Thông tin người mua" },
  { id: "seller", label: "Thông tin người bán" },
] as const;

const BUYER_LEFT: PartyField[] = [
  { key: "taxCode", label: "Mã số thuế/CCCD" },
  { key: "budgetUnitCode", label: "Mã ĐVQHNS" },
  { key: "unitName", label: "Tên đơn vị" },
  { key: "address", label: "Địa chỉ" },
  { key: "buyerName", label: "Người mua hàng" },
  { key: "idNumber", label: "Số CMND/CCCD" },
];

const BUYER_RIGHT: PartyField[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Số điện thoại" },
  { key: "bankAccount", label: "Số tài khoản" },
  { key: "bankName", label: "Tên ngân hàng" },
  { key: "passportNo", label: "Số hộ chiếu" },
];

const SELLER_LEFT: PartyField[] = [
  // Mã số thuế người bán lấy từ thiết lập kết nối, không sửa ở đây.
  { key: "taxCode", label: "Mã số thuế", disabled: true },
  { key: "sellerUnit", label: "Đơn vị bán hàng" },
  { key: "address", label: "Địa chỉ" },
  { key: "storeCode", label: "Mã cửa hàng" },
];

const SELLER_RIGHT: PartyField[] = [
  { key: "phone", label: "Số điện thoại" },
  { key: "bankAccount", label: "Số tài khoản" },
  { key: "bankName", label: "Tên ngân hàng" },
  { key: "storeName", label: "Tên cửa hàng" },
];

/** Modal "Sửa" hóa đơn chưa phát hành: người mua / người bán, DS hàng hóa, mẫu + ký hiệu. */
export function EInvoiceEditModal({ record, onClose }: Props) {
  const [partyTab, setPartyTab] = useState<PartyTab>("buyer");
  const [expanded, setExpanded] = useState(false);
  const [buyer, setBuyer] = useState<EInvoiceBuyer>(record.buyer);
  const [seller, setSeller] = useState<EInvoiceSeller>(record.seller);
  const [templateNo, setTemplateNo] = useState(record.templateNo);
  const [symbol, setSymbol] = useState(record.symbol);
  // Lỗi bắt buộc chỉ hiện sau khi bấm "Phát hành" (ảnh 4 của modal).
  const [showErrors, setShowErrors] = useState(false);
  const { save, issue } = useEInvoiceMutations();

  const patch = { buyer, seller, templateNo, symbol };
  const templateError = showErrors && !templateNo;
  const symbolError = showErrors && !symbol;
  const busy = save.isPending || issue.isPending;

  const handleIssue = () => {
    if (!templateNo || !symbol) {
      setShowErrors(true);
      return;
    }
    issue.mutate(
      { ids: [record.id], template: { templateNo, symbol }, patch },
      { onSuccess: onClose },
    );
  };

  const recipientFields: PartyField[] = [
    { key: "recipientName", label: "Tên người nhận", disabled: !buyer.sendToCustomer },
  ];
  const recipientEmailFields: PartyField[] = [
    {
      key: "recipientEmails",
      label: "Email",
      disabled: !buyer.sendToCustomer,
      placeholder: "Các email cách nhau bởi dấu ;",
      info: "Các email cách nhau bởi dấu ;",
    },
  ];

  return (
    <AppModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Sửa"
      defaultWidth={1000}
      defaultHeight={708}
      bodyClassName="-mx-4 -mt-4 flex flex-col overflow-hidden"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={notifyNotSupported}>
            Xem hóa đơn
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy} onClick={handleIssue}>
              <Send className="mr-1.5 h-4 w-4" />
              Phát hành
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => save.mutate({ id: record.id, patch }, { onSuccess: onClose })}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Lưu
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      {expanded ? null : (
        <>
          <Tabs tabs={PARTY_TABS} activeTab={partyTab} onTabChange={setPartyTab} />
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
            {partyTab === "buyer" ? (
              <>
                <EInvoicePartyForm
                  left={BUYER_LEFT}
                  right={BUYER_RIGHT}
                  values={buyer as unknown as Record<string, string>}
                  onChange={(key, value) => setBuyer((b) => ({ ...b, [key]: value }))}
                />
                <label className="flex h-8 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={buyer.sendToCustomer}
                    onChange={(e) => setBuyer((b) => ({ ...b, sendToCustomer: e.target.checked }))}
                  />
                  Gửi hóa đơn cho khách hàng
                </label>
                <EInvoicePartyForm
                  left={recipientFields}
                  right={recipientEmailFields}
                  values={buyer as unknown as Record<string, string>}
                  onChange={(key, value) => setBuyer((b) => ({ ...b, [key]: value }))}
                />
              </>
            ) : (
              <EInvoicePartyForm
                left={SELLER_LEFT}
                right={SELLER_RIGHT}
                values={seller as unknown as Record<string, string>}
                onChange={(key, value) => setSeller((s) => ({ ...s, [key]: value }))}
              />
            )}
          </div>
        </>
      )}

      <div className={cn("flex flex-col gap-3 px-4 pb-1", expanded && "min-h-0 flex-1")}>
        <InvoiceLinesSection
          lines={record.lines}
          promotionTotal={record.promotionTotal}
          total={record.total}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />

        <div className="grid grid-cols-2 gap-x-12">
          {[
            { key: "templateNo", label: "Mẫu hóa đơn", value: templateNo, set: setTemplateNo, options: EINVOICE_TEMPLATE_OPTIONS, error: templateError },
            { key: "symbol", label: "Ký hiệu mẫu", value: symbol, set: setSymbol, options: EINVOICE_SYMBOL_OPTIONS, error: symbolError },
          ].map((f) => (
            <div key={f.key} className="grid grid-cols-[120px_1fr_20px] items-center gap-3">
              <span className="text-[13px]">
                {f.label} <span className="text-destructive">*</span>
              </span>
              <SingleSelect
                options={f.options}
                value={f.value}
                onValueChange={f.set}
                placeholder=""
                className={cn("h-8 bg-background text-[13px]", f.error && "border-destructive")}
                contentClassName="text-[13px]"
              />
              {f.error ? (
                <span title={`${f.label} không được để trống`} className="inline-flex">
                  <AlertCircle
                    className="h-4 w-4 fill-destructive text-background"
                    aria-label={`${f.label} không được để trống`}
                  />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </AppModal>
  );
}
