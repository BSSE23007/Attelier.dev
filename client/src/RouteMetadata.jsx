import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyPageMetadata, getPageMetadata } from "./seoMetadata";

export default function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    applyPageMetadata(getPageMetadata(pathname));
  }, [pathname]);

  return null;
}
