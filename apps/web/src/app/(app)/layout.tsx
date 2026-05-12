import { AuthGuard } from '@/components/auth-guard';
import { AppSidebar, MobileSidebarTrigger } from '@/components/app-sidebar';
import { UserMenu } from '@/components/user-menu';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-16 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
            <MobileSidebarTrigger />
            <div className="ml-auto">
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-muted/10 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
