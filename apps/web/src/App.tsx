import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ComparePage from './pages/ComparePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ComparePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
