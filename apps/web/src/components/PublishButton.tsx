import { useState } from 'react';
import { toast } from 'react-toastify';
import { useHttp } from '@services';
import { API_ENDPOINT, REQUEST_METHOD } from 'src/common';
import { Button } from './Button';

interface PublishButtonProps {
  sessionId: string;
}

export const PublishButton = ({ sessionId }: PublishButtonProps) => {
  const { sendApiRequest } = useHttp();
  const [published, setPublished] = useState(false);

  const handlePublish = () => {
    sendApiRequest(
      { endpoint: API_ENDPOINT.markSessionPublished(sessionId), method: REQUEST_METHOD.PATCH },
      () => {
        setPublished(true);
        toast.success('Care plan published successfully.');
      },
      () => {
        toast.error('Failed to publish care plan.');
      },
    );
  };

  return (
    <Button
      variant='primary'
      type='button'
      classes='ml-2'
      disabled={published}
      onClick={handlePublish}
    >
      {published ? 'Published' : 'Publish'}
    </Button>
  );
};
