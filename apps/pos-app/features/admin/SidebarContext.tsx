import { createContext, useContext } from "react";

interface SidebarCtx {
  openSidebar: () => void;
  isPhoneMode: boolean;
  /** Tablet inline sidebar visibility — used by kiosk/fullscreen modes to reclaim the rail. */
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
}

export const SidebarContext = createContext<SidebarCtx>({
  openSidebar: () => {},
  isPhoneMode: false,
  sidebarHidden: false,
  setSidebarHidden: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
