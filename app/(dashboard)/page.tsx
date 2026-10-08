import { Button } from '@/components/ui/button';
import { ArrowRight, BookOpen, FileText, ShieldCheck } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    title: 'Understand the case',
    body: 'Each case is classified, summarized and given an urgency, with what is still missing from the customer.'
  },
  {
    icon: BookOpen,
    title: 'Grounded in your knowledge',
    body: 'The analysis uses only your team’s own documents, and shows exactly which ones — and which version — it relied on.'
  },
  {
    icon: ShieldCheck,
    title: 'You stay in control',
    body: 'The AI proposes a recommended action and a draft reply. A person reviews, edits and sends. Nothing is sent automatically.'
  }
];

export default function HomePage() {
  return (
    <main>
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="sm:text-center md:max-w-2xl md:mx-auto lg:text-left lg:mx-0">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
              AI-assisted support
              <span className="block text-orange-500">for your back office</span>
            </h1>
            <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
              AI Back Office CS helps small customer-service teams classify
              cases, retrieve the relevant internal knowledge, and prepare a
              draft reply — with a human reviewing every step.
            </p>
            <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
              <a href="/sign-in">
                <Button
                  size="lg"
                  variant="outline"
                  className="text-lg rounded-full"
                >
                  Open the dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-3 lg:gap-8">
            {steps.map((step, index) => (
              <div key={step.title} className={index > 0 ? 'mt-10 lg:mt-0' : ''}>
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-orange-500 text-white">
                  <step.icon className="h-6 w-6" />
                </div>
                <div className="mt-5">
                  <h2 className="text-lg font-medium text-gray-900">
                    {step.title}
                  </h2>
                  <p className="mt-2 text-base text-gray-500">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
