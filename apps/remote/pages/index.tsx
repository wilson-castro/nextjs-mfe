import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import ServerCard from '../components/ServerCard';
import { getServerData } from '../lib/getServerData';
import type { ServerPayload } from '../types';

interface RemoteHomeProps {
  readonly serverData: ServerPayload;
}

const RemoteHomePage: NextPage<RemoteHomeProps> = ({ serverData }) => {
  return (
    <>
      <Head>
        <title>Remote App (Port 3001)</title>
        <meta name="description" content="Remote Micro-Frontend App" />
      </Head>

      <main className="container">
        <header className="header">
          <h1>Remote Standalone Application</h1>
          <p>Running natively on port 3001 using Next.js 15 Pages Router with SSR.</p>
        </header>

        <ServerCard initialData={serverData} title="Remote Standalone SSR Card" />
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<RemoteHomeProps> = async () => {
  const serverData = await getServerData();
  return {
    props: {
      serverData,
    },
  };
};

export default RemoteHomePage;
