import { Button } from "@/components/ui/button";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="MySubscriptions home">
        MySubscriptions
      </Link>
      <div className="header-account">
        <span className="sample-indicator">Sample workspace</span>
        <Button variant="secondary" size="sm" asChild>
          <a href="#about-sample" aria-label="About this sample">
            <span className="hidden sm:inline">About this sample</span>
            <span className="sm:hidden">Sample</span>
          </a>
        </Button>
      </div>
    </header>
  );
}
