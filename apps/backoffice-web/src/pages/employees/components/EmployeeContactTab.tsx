import type { Employee } from "../employee.types";
import { ContactFieldRow } from "./ContactFieldRow";

interface EmployeeContactTabProps {
  employee: Employee;
}

export function EmployeeContactTab({ employee }: EmployeeContactTabProps) {
  const { contact, emergencyContact } = employee;

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Liên hệ</h4>
        <ContactFieldRow label="ĐT di động" value={contact.mobile} />
        <ContactFieldRow label="ĐT nhà riêng" value={contact.homePhone} />
        <ContactFieldRow label="Email" value={contact.email} />
        <ContactFieldRow label="Địa chỉ" value={contact.address} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">Liên hệ khẩn cấp</h4>
        <ContactFieldRow label="Họ và tên" value={emergencyContact.fullName} />
        <ContactFieldRow label="Quan hệ" value={emergencyContact.relationship} />
        <ContactFieldRow label="ĐT di động" value={emergencyContact.mobile} />
        <ContactFieldRow label="ĐT nhà riêng" value={emergencyContact.homePhone} />
        <ContactFieldRow label="Email" value={emergencyContact.email} />
        <ContactFieldRow label="Địa chỉ" value={emergencyContact.address} />
      </div>
    </div>
  );
}
