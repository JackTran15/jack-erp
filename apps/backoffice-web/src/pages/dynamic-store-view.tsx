import { PageKey, pageRegistry } from "../constants/page-registry.constant";
import { useCurrentView } from "../store/common/branch/branch.store";

export const DynamicStoreView = ({ type }: { type: PageKey }) => {
    const view = useCurrentView();
    
    const Component = pageRegistry[type][view];
    if (!Component) return <></>

    return <Component />;
}
