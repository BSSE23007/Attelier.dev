import { useLocation } from "react-router-dom";
import { getStructuredData, serializeStructuredData } from "./structuredData";

export default function StructuredData() {
  const { pathname } = useLocation();
  const structuredData = getStructuredData(pathname);

  if (!structuredData) return null;

  return (
    <script
      type="application/ld+json"
      data-attelier-structured-data=""
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
    />
  );
}
