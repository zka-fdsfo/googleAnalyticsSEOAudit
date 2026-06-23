import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/Loader';
import toast from 'react-hot-toast';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      loginWithToken(token);
      toast.success('Signed in with Google!');
      navigate('/dashboard', { replace: true });
    } else {
      toast.error('Authentication failed.');
      navigate('/login', { replace: true });
    }
  }, []);

  return <PageLoader text="Signing you in..." />;
}
