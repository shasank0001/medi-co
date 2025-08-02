import { useState } from "react";
import { Shield, FileText, Stethoscope } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { 
    title: "Prescription Verifier", 
    url: "/", 
    icon: Shield,
    description: "AI-powered prescription verification"
  },
  { 
    title: "Patient Documents", 
    url: "/documents", 
    icon: FileText,
    description: "Document management and AI summaries"
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-medical-light text-medical-blue font-medium border-r-2 border-medical-blue" 
      : "hover:bg-medical-light/50 text-foreground";

  return (
    <Sidebar
      className={`${isCollapsed ? "w-14" : "w-64"} border-clinical-border bg-card`}
      collapsible="icon"
    >
      <SidebarContent>
        {/* Header */}
        <div className="p-6 border-b border-clinical-border">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-medical-blue rounded-lg flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Medi-Care AI</h1>
                <p className="text-xs text-muted-foreground">Clinical Decision Support</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 bg-medical-blue rounded-lg flex items-center justify-center mx-auto">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
          )}
        </div>

        <SidebarGroup className="px-3 py-4">
          <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
            Navigation
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-12">
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="w-5 h-5" />
                      {!isCollapsed && (
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">{item.title}</span>
                          <span className="text-xs text-muted-foreground">{item.description}</span>
                        </div>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}