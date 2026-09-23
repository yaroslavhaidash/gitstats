/** The corner rules around the landing hero's board screenshot. */
export function Brackets() {
  return (
    <>
      <div className="hidden sm:block absolute -top-6 -right-6 w-20 h-20 border-t-2 border-r-2 border-alert opacity-50 pointer-events-none" />
      <div className="hidden sm:block absolute -bottom-6 -left-6 w-20 h-20 border-b-2 border-l-2 border-alert opacity-50 pointer-events-none" />
    </>
  );
}
