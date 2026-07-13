import { Link, NavLink, useLocation } from "react-router-dom";
import logo from "../ui/marhaba logo1.svg";
// [MODIFIED] Added 'Menu' icon
import { Heart, Save, Menu, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "../../context/ThemeContext";


// Import Tooltip components
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// [ADDED] Import DropdownMenu components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SiteHeader() {
  const location = useLocation();
  const { user, logout, userRole } = useAuth(); // ← GET USER DATA
  const { theme, toggleTheme } = useTheme();

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  // Avatar Letter
  const avatarLetter = user?.email?.[0]?.toUpperCase() || "U";

  // Show nav & icons
  const showIconButtons = location.pathname === '/offer-bank';
  const showNavLinks = ['/offer-bank', '/promotion-analysis'].includes(location.pathname.toLowerCase());

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'inline-flex items-center gap-2 h-9 px-4 rounded-md font-medium text-white text-sm bg-gradient-to-r from-purple-500 to-orange-500 shadow-sm transition-transform duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:from-purple-300 disabled:to-orange-300'
      : 'inline-flex items-center h-9 px-4 rounded-md font-medium text-gray-300 text-sm hover:bg-white/10 hover:text-white transition-colors';

  return (
    <TooltipProvider>
      <header className="relative w-full bg-black/30 backdrop-blur-lg">
        <div className="container flex h-28 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img src={logo} alt="Marhaba AI Logo" className="h-24 w-auto" />
          </Link>

          {/* Right Side */}
          <div className="flex items-center gap-x-6">
            {/* Nav Links */}
            {showNavLinks && (
              <nav className="flex items-center gap-x-2">
                <NavLink to="/offer-bank" className={getNavLinkClass}>
                  Offer Index
                </NavLink>
                <NavLink to="/promotion-analysis" className={getNavLinkClass}>
                  Promo Analysis
                </NavLink>
              </nav>
            )}

            {/* [MODIFIED] Replaced Profile + Logout with a Dropdown Menu */}
            {user && (
              <div className="flex items-center border-l border-white/20 pl-6 gap-3">
                {/* Theme Toggle Button */}
                <button
                  onClick={toggleTheme}
                  aria-label="Toggle light/dark theme"
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white transition-all shadow-sm"
                >
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Open user menu"
                      className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-r from-purple-500 to-orange-500 text-white shadow-lg transition-transform duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <Menu className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-64 bg-zinc-900/90 backdrop-blur-md border-zinc-700 text-zinc-200"
                    align="end"
                    forceMount
                  >
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex items-center gap-3 py-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {avatarLetter}
                        </div>
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none text-white">{user.email}</p>
                          <p className="text-xs leading-none text-gray-400 capitalize">{userRole || "User"}</p>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/20" />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-red-400 focus:bg-red-500/20 focus:text-red-300 cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* === END OF MODIFIED SECTION === */}

          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full h-px bg-[linear-gradient(to_right,transparent,rgba(15,23,42,0.25),transparent)] dark:bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.5),transparent)]" aria-hidden="true" />
      </header>
    </TooltipProvider>
  );
}