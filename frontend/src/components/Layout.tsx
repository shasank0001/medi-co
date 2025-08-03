import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-14 border-b border-clinical-border bg-card flex items-center px-6">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1">
              <h2 className="text-sm font-medium text-muted-foreground">
                Clinical Decision Support System
              </h2>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6 bg-medical-light/30">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}