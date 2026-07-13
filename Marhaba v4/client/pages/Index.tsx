import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  Users,
  UserRoundCheck,
  UserStar,
  ArrowRight,
  BookOpenText,
  ChartSpline,
} from "lucide-react";

// Card component restyled for white cards on a black background
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`
      bg-white rounded-2xl
      shadow-lg shadow-black/20
      ring-1 ring-white/10
      transition-all duration-300 ease-in-out
      hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40 hover:ring-white/20
      ${className}
    `}
  >
    {children}
  </div>
);

export default function Index() {
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch all clients
        const { data: clientsData, error: clientsError } = await supabase
          .from("clients")
          .select("id");

        // Fetch all client users
        const { data: usersData, error: usersError } = await supabase
          .from("client_users")
          .select("client_id, active");

        if (clientsError) {
          console.error("Error fetching clients:", clientsError);
        }
        if (usersError) {
          console.error("Error fetching users:", usersError);
        }

        const totalClients = clientsData ? clientsData.length : 0;
        const totalUsers = usersData ? usersData.length : 0;

        // Active clients: count of unique client_ids where user.active is true
        const activeClientIds = new Set(
          (usersData || [])
            .filter((u) => u.active === true)
            .map((u) => u.client_id)
        );
        const activeClients = activeClientIds.size;

        setStats({
          totalClients,
          activeClients,
          totalUsers,
        });
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="py-8 md:py-12">
      <div className="space-y-10">
        {/* Top feature cards */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Offer Index */}
          <Card className="flex flex-col justify-between p-8 gap-6 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80">
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-100 text-slate-900 dark:bg-zinc-800 dark:text-purple-400 p-3 inline-block">
                <BookOpenText className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-zinc-50">Offer Index</h2>
              <p className="text-slate-600 dark:text-zinc-400 max-w-md">
                A visual repository presenting current and previous offers and
                flyers, updated bi-weekly.
              </p>
            </div>
            <Link
              to="/offer-bank"
              className="group inline-flex items-center gap-2
                  h-10 px-5 w-fit
                  rounded-full font-semibold text-white text-sm
                  bg-black dark:bg-purple-600 dark:hover:bg-purple-700
                  transition-colors duration-300 ease-in-out
                  hover:bg-slate-800
                  focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-white"
            >
              Explore
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Card>

          {/* Promotion Analysis */}
          <Card className="flex flex-col justify-between p-8 gap-8 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80">
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-100 text-slate-900 dark:bg-zinc-800 dark:text-purple-400 p-3 inline-block">
                <ChartSpline className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-zinc-50">Promotion Analysis</h2>
              <p className="text-slate-600 dark:text-zinc-400 max-w-md">
                In-depth promo insights and pricing analysis to support
                strategic decision-making and gain a competitive edge.
              </p>
            </div>
            <Link
              to="/promotion-analysis"
              className="group inline-flex items-center gap-2
                  h-10 px-5 w-fit
                  rounded-full font-semibold text-white text-sm
                  bg-black dark:bg-purple-600 dark:hover:bg-purple-700
                  transition-colors duration-300 ease-in-out
                  hover:bg-slate-800
                  focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-white"
            >
              View Reports
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Card>
        </div>

        {/* Stats row */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="p-6 md:p-7 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">Total Clients</span>
              <UserStar className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 text-5xl font-black tracking-tighter text-slate-900 dark:text-zinc-50 flex items-center min-h-[3rem]">
              {loading ? (
                <div className="h-10 w-16 bg-slate-200 animate-pulse rounded-md" />
              ) : (
                stats.totalClients
              )}
            </div>
          </Card>

          <Card className="p-6 md:p-7 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">Active Clients</span>
              <UserRoundCheck className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 text-5xl font-black tracking-tighter text-slate-900 dark:text-zinc-50 flex items-center min-h-[3rem]">
              {loading ? (
                <div className="h-10 w-16 bg-slate-200 animate-pulse rounded-md" />
              ) : (
                stats.activeClients
              )}
            </div>
          </Card>

          <Card className="p-6 md:p-7 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">Total Users</span>
              <Users className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 text-5xl font-black tracking-tighter text-slate-900 dark:text-zinc-50 flex items-center min-h-[3rem]">
              {loading ? (
                <div className="h-10 w-16 bg-slate-200 animate-pulse rounded-md" />
              ) : (
                stats.totalUsers
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}