import type { Employee } from "../employee.types";

interface EmployeeRolesTabProps {
  employee: Employee;
}

export function EmployeeRolesTab({ employee }: EmployeeRolesTabProps) {
  if (employee.roles.length === 0) {
    return <p className="text-sm text-muted-foreground">Nhân viên chưa được gán vai trò.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="bg-muted/40">
        <tr className="border-b">
          <th className="border-r px-2 py-1.5 text-left font-medium">Tên vai trò</th>
          <th className="px-2 py-1.5 text-left font-medium">Diễn giải</th>
        </tr>
      </thead>
      <tbody>
        {employee.roles.map((role) => (
          <tr key={role.id} className="border-b">
            <td className="border-r px-2 py-1">{role.name}</td>
            <td className="px-2 py-1 text-muted-foreground">{role.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
