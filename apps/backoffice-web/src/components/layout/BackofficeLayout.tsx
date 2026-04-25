import { Outlet } from "react-router-dom";
import { BackofficeNav } from "./BackofficeNav";

export function BackofficeLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <BackofficeNav />
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
