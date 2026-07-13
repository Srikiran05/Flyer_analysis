import { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of the context
interface LayoutContextType {
    sidebarNode: ReactNode | null;
    setSidebarNode: (node: ReactNode | null) => void;
}

// Create the context
const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

// Create the Provider component
export const LayoutProvider = ({ children }: { children: ReactNode }) => {
    const [sidebarNode, setSidebarNode] = useState<ReactNode | null>(null);

    return (
        <LayoutContext.Provider value={{ sidebarNode, setSidebarNode }}>
            {children}
        </LayoutContext.Provider>
    );
};

// Create a custom hook to use the context
export const useLayout = () => {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
};