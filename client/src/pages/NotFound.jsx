import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SearchIcon } from "../components/ui/icons.jsx";

export default function NotFound() {
  return (
    <div className="not-found-page">
      <EmptyState
        icon={SearchIcon}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Link to="/" className="btn btn-primary btn-sm">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
