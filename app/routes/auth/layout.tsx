import { Outlet, Link } from "react-router";

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md border p-8 rounded-xl space-y-6">
        <div className="flex justify-center gap-4"></div>

        <Outlet />
      </div>
    </div>
  );
}
