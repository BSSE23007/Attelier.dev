import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isAdminPath, syncTawkRoute } from "./tawkService";

export default function TawkChat() {
  const { pathname } = useLocation();
  const isAdmin = isAdminPath(pathname);

  useEffect(() => {
    void syncTawkRoute(pathname);
  }, [isAdmin, pathname]);

  return null;
}
