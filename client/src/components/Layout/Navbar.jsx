import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { Menu, MenuItem } from "../ui/Menu.jsx";
import { PulseIcon, ChevronDownIcon, LogOutIcon, UserIcon } from "../ui/icons.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link to={user ? `/${user.role}` : "/"} className="brand">
          <span className="brand-mark">
            <PulseIcon size={17} />
          </span>
          Healthcare Portal
        </Link>

        <div className="header-actions">
          {user ? (
            <>
              <span className="role-chip">{user.role}</span>
              <Menu
                trigger={(toggle, open) => (
                  <button
                    type="button"
                    className="user-trigger"
                    onClick={toggle}
                    aria-haspopup="menu"
                    aria-expanded={open}
                  >
                    <Avatar name={user.name} size="sm" />
                    <span className="user-trigger-name">{user.name}</span>
                    <ChevronDownIcon className="icon-chevron" />
                  </button>
                )}
              >
                <div className="menu-label">Signed in as {user.email}</div>
                <div className="menu-divider" />
                <MenuItem icon={UserIcon} onClick={() => navigate(`/${user.role}`)}>
                  Dashboard
                </MenuItem>
                <MenuItem icon={LogOutIcon} danger onClick={handleLogout}>
                  Log out
                </MenuItem>
              </Menu>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
