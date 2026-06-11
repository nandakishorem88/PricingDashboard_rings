import { useRoute } from './useRoute';
import { Home } from './pages/Home';
import { RingsDeepDive } from './pages/RingsDeepDive';
import { Dashboard } from './pages/Dashboard';
import { Optimizer } from './pages/Optimizer';
import { Investigate } from './pages/Investigate';
import { GrnBenchmark } from './pages/GrnBenchmark';

export default function App() {
  const { path, navigate } = useRoute();

  // Investigation drill-down — /investigate?part=XXX&plant=jsr
  if (path === '/investigate') {
    const params = new URLSearchParams(window.location.search);
    const partNo = params.get('part') || '';
    const plant = (params.get('plant') === 'inja' ? 'inja' : 'jsr') as 'jsr' | 'inja';
    return <Investigate partNo={partNo} plant={plant} navigate={navigate} />;
  }

  // GRN Benchmark
  if (path === '/jsr/grn-benchmark'  || path === '/jamshedpur/grn-benchmark') return <GrnBenchmark plant="jsr"  navigate={navigate} />;
  if (path === '/inja/grn-benchmark' || path === '/chennai/grn-benchmark')    return <GrnBenchmark plant="inja" navigate={navigate} />;

  // Optimizer drill-downs
  if (path === '/jsr/optimizer'  || path === '/jamshedpur/optimizer') return <Optimizer plant="jsr"  navigate={navigate} />;
  if (path === '/inja/optimizer' || path === '/chennai/optimizer')    return <Optimizer plant="inja" navigate={navigate} />;

  // Plant dashboards
  if (path === '/jsr'  || path === '/jamshedpur') return <Dashboard plant="jsr"  navigate={navigate} />;
  if (path === '/inja' || path === '/chennai')    return <Dashboard plant="inja" navigate={navigate} />;

  // Product deep dive
  if (path === '/rings') return <RingsDeepDive navigate={navigate} />;

  // Home (AI Decision Support System)
  return <Home navigate={navigate} />;
}
