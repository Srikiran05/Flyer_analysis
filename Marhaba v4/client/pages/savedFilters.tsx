import { useNavigate } from "react-router-dom";
import { useFilters } from "./FilterContex";
import { format } from "date-fns";
import { FileText, Tag } from "lucide-react";

// A helper component to display each filter property with an icon
const FilterDetail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start text-sm">
    <Tag className="h-4 w-4 mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  </div>
);

export default function SavedFilters() {
    const { savedFilters, removeFilter, clearAllFilters } = useFilters();
    const navigate = useNavigate();

    const handleApplyFilter = (filter: any) => {
        navigate('/offer-bank', { state: { appliedFilter: filter } });
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Saved Filters</h1>
                {savedFilters.length > 0 && (
                    <button
                        onClick={clearAllFilters}
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                        Clear All
                    </button>
                )}
            </div>

            {savedFilters.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                    <h3 className="text-lg font-medium text-gray-900">No Filters Saved Yet</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Go to the Offer Index to apply and save a filter.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {savedFilters.map((filter) => (
                        <div key={filter.id} className="flex flex-col justify-between rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileText className="h-5 w-5 mr-3 text-purple-600 flex-shrink-0" />
                                    <h2 className="text-lg font-semibold text-gray-900 truncate" title={filter.name}>
                                        {filter.name || "Untitled Filter"}
                                    </h2>
                                </div>
                                {filter.description && (
                                    <p className="mb-4 text-sm text-gray-600 pl-8 border-l-2 border-gray-100 ml-2.5">
                                        {filter.description}
                                    </p>
                                )}

                                <div className="space-y-2 border-t pt-4 mt-4">
                                    <FilterDetail label="Offer Type" value={filter.offerType} />
                                    <FilterDetail label="Country" value={filter.country} />
                                    <FilterDetail label="City" value={filter.city} />
                                    <FilterDetail label="Retailer" value={filter.retailer} />
                                    <FilterDetail label="Category" value={filter.category} />
                                    {filter.search && <FilterDetail label="Search" value={filter.search} />}
                                    {(() => {
                                      if (!filter.range?.from || !filter.range?.to) return null;
                                      try {
                                        const fromD = new Date(filter.range.from);
                                        const toD = new Date(filter.range.to);
                                        if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) return null;
                                        return (
                                          <FilterDetail
                                              label="Date Range"
                                              value={`${format(fromD, "dd MMM yyyy")} - ${format(toD, "dd MMM yyyy")}`}
                                          />
                                        );
                                      } catch {
                                        return null;
                                      }
                                    })()}
                                </div>
                            </div>
                            <div className="mt-6 flex items-center gap-3">
                                <button
                                    onClick={() => handleApplyFilter(filter)}
                                    className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                                >
                                    Apply
                                </button>
                                <button
                                    onClick={() => removeFilter(filter.id!)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}