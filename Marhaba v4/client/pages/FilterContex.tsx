import React, { createContext, useContext, useState, useEffect } from "react";

// Add 'name' and 'description' properties to the Filter type
type Filter = Record<string, any> & {
  id?: number;
  name?: string;
  description?: string;
};

type FilterContextType = {
  savedFilters: Filter[];
  // Update saveFilter signature
  saveFilter: (filter: Filter, name: string, description: string) => void;
  removeFilter: (idToRemove: number) => void;
  clearAllFilters: () => void;
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedFilters, setSavedFilters] = useState<Filter[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("savedFilters");
    if (stored) setSavedFilters(JSON.parse(stored));
  }, []);

  // Save to localStorage whenever filters change
  useEffect(() => {
    localStorage.setItem("savedFilters", JSON.stringify(savedFilters));
  }, [savedFilters]);

  /**
   * Saves a filter with its name and description.
   */
  const saveFilter = (filter: Filter, name: string, description: string) => {
    // A name is required to save the filter
    if (!filter || Object.keys(filter).length === 0 || !name) return;
    
    const newFilterWithDetails = {
      ...filter,
      id: Date.now() + Math.random(),
      name: name,
      description: description,
    };
    setSavedFilters((prev) => [...prev, newFilterWithDetails]);
  };

  /**
   * Removes a single filter from the list by its unique ID.
   * @param {number} idToRemove - The ID of the filter to remove.
   */
  const removeFilter = (idToRemove: number) => {
    // Filter by the 'id' property instead of the array index
    setSavedFilters((prev) => prev.filter((filter) => filter.id !== idToRemove));
  };

  /**
   * Clears all currently saved filters.
   */
  const clearAllFilters = () => {
    setSavedFilters([]);
  };

  return (
    <FilterContext.Provider 
      value={{ 
        savedFilters, 
        saveFilter, 
        removeFilter,
        clearAllFilters 
      }}
    >
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used inside FilterProvider");
  return ctx;
};