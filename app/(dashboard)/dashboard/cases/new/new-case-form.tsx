'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCase } from '../actions';

type ActionState = { error?: string; success?: string };

export function NewCaseForm() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    createCase,
    {}
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/cases"
        className="mb-3 inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        All cases
      </Link>
      <h1 className="mb-6 text-lg font-medium text-gray-900 lg:text-2xl">
        New case
      </h1>

      <form action={action}>
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-sm text-gray-700">
              Paste the customer request
            </CardTitle>
            <CardDescription>
              Copy the customer&apos;s message as it arrived. You will run the AI
              analysis from the case workspace; nothing is sent to the customer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="subject" className="mb-2">
                Subject
              </Label>
              <Input id="subject" name="subject" required maxLength={255} />
            </div>
            <div>
              <Label htmlFor="customerEmail" className="mb-2">
                Customer email (optional)
              </Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                maxLength={255}
              />
            </div>
            <div>
              <Label htmlFor="customerMessage" className="mb-2">
                Customer message
              </Label>
              <textarea
                id="customerMessage"
                name="customerMessage"
                required
                rows={10}
                maxLength={10000}
                className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-red-600">
                {state.error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create case'
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
